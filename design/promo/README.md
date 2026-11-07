# 30 秒宣传片素材

| 文件 | 用途 |
|---|---|
| `intro.html` | 0–3s 开屏：Spark 跳动 + 字幕，炸开后露出主界面 |
| `outro.html` | 26–30s 片尾卡：产品名和 GitHub 地址 |
| `captions.srt` | 3–26s 中段字幕，成片里已经烧录；另外剪辑时可以直接导入 |
| `record.cjs` | 用合成事件驱动真实应用并逐帧录屏（不调用模型，不读真实会话，数据目录和项目都是临时的） |
| `assemble.cjs` | 按分镜剪辑录屏、做特写、叠字幕，与开屏和片尾拼成 `out/promo-16x9.mp4` |
| `music.html` | 原创配乐，全部由 Web Audio 合成，没有采样素材。浏览器打开可直接试听 |
| `music.cjs` | 离线渲染配乐，标准化到 -16 LUFS，混入成片 `out/promo-16x9-music.mp4` |
| `render.cjs` | 逐帧导出 1920×1080 和 1080×1920 两种 60fps MP4，输出到 `out/`（已被 .gitignore 忽略） |

## 预览

直接用浏览器打开 HTML。点击或按空格重播，`?at=1800` 可定格在某一毫秒。

## 导出

```sh
env -u ELECTRON_RUN_AS_NODE npx electron design/promo/render.cjs            # 全部
env -u ELECTRON_RUN_AS_NODE npx electron design/promo/render.cjs intro --shot=主界面截图.png
```

`--shot` 用真实界面截图替换开屏炸开后的占位色块。截图应和中段第一个镜头的画面一致，这样开屏可以无缝接上录屏。

## 一键出成片

```sh
npm run build
env -u ELECTRON_RUN_AS_NODE npx electron design/promo/render.cjs     # 开屏、片尾
env -u ELECTRON_RUN_AS_NODE npx electron design/promo/record.cjs     # 录制约 70 秒，期间会弹出应用窗口并置顶
env -u ELECTRON_RUN_AS_NODE npx electron design/promo/assemble.cjs   # 合成 30 秒成片
env -u ELECTRON_RUN_AS_NODE npx electron design/promo/music.cjs      # 渲染配乐并混入
```

螃蟹工作时的动作由随机 spinner 动词决定，不对应具体工具；录制时只挑选几种不同动作，字幕也不暗示这种对应关系。
