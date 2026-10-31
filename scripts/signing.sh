#!/bin/zsh
# 本地签名身份：一张自签名的代码签名证书，放在单独的钥匙串里（不碰登录钥匙串）。
# 用固定证书签名后，每次重新安装应用，macOS 仍认得是同一个应用，
# 「想访问桌面/文稿文件夹」之类的授权只需要允许一次。
# 用法：source 本文件后调用 sign_app <应用路径>
set -euo pipefail

SIGN_KEYCHAIN="$HOME/Library/Keychains/claude-desk-signing.keychain-db"
SIGN_NAME="Claude Desk Local Signing"
# 这个钥匙串只存这张本地签名证书，密码不需要保密
SIGN_PW="claude-desk-local"

if [[ ! -e "$SIGN_KEYCHAIN" ]]; then
  tmp=$(mktemp -d)
  cat > "$tmp/cfg" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $SIGN_NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout "$tmp/key.pem" -out "$tmp/cert.pem" -config "$tmp/cfg" 2>/dev/null
  openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -out "$tmp/id.p12" -passout "pass:$SIGN_PW"
  security create-keychain -p "$SIGN_PW" "$SIGN_KEYCHAIN"
  security set-keychain-settings "$SIGN_KEYCHAIN" # 不自动上锁
  security import "$tmp/id.p12" -k "$SIGN_KEYCHAIN" -P "$SIGN_PW" -T /usr/bin/codesign >/dev/null
  security set-key-partition-list -S apple-tool:,apple: -s -k "$SIGN_PW" "$SIGN_KEYCHAIN" >/dev/null
  rm -rf "$tmp"
  echo "已创建本地签名证书：$SIGN_NAME"
fi
security unlock-keychain -p "$SIGN_PW" "$SIGN_KEYCHAIN"
SIGN_HASH=$(security find-certificate -c "$SIGN_NAME" -Z "$SIGN_KEYCHAIN" | awk '/SHA-1/{print $3}')

# 用本地证书签名；codesign 只在钥匙串搜索列表里找证书，签完恢复原列表
sign_app() {
  local saved=("${(@f)$(security list-keychains -d user | sed -e 's/^ *"//' -e 's/"$//')}")
  security list-keychains -d user -s "${saved[@]}" "$SIGN_KEYCHAIN"
  codesign --force --deep --sign "$SIGN_HASH" "$1" || { security list-keychains -d user -s "${saved[@]}"; return 1 }
  security list-keychains -d user -s "${saved[@]}"
}
