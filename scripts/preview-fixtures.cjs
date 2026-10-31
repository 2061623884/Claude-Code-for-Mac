// 合成文档，不含用户数据。供离线桌面冒烟测试使用。
const { writeFileSync, copyFileSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const JSZip = require('jszip')
const XLSX = require('xlsx')
exports.writeFixtures = async (root) => {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="image1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/></Relationships>')
  zip.file('word/media/pixel.png', readFileSync(join(__dirname, '../test/fixtures/documents/picture.png')))
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:t>中文文档 · 内嵌预览</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数值 42</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="pixel"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="image1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`)
  writeFileSync(join(root, 'example.docx'), await zip.generateAsync({ type: 'nodebuffer' }))
  const workbook = XLSX.utils.book_new()
  const first = XLSX.utils.aoa_to_sheet([['产品', '日期', '总额'], ['桌面端', new Date(2026, 9, 31), 42]], { dateNF: 'yyyy-mm-dd' })
  first.C3 = { t: 'n', f: 'C2*2', v: 84 }; first.C4 = { t: 'n', f: 'C2*3' }; first['!ref'] = 'A1:C4'
  XLSX.utils.book_append_sheet(workbook, first, '概览')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(Array.from({length: 20000}, (_,i) => ['row-'+i, i])), '大表')
  for (const extension of ['xlsx', 'xls']) writeFileSync(join(root, 'example.'+extension), XLSX.write(workbook, { type: 'buffer', bookType: extension === 'xls' ? 'biff8' : 'xlsx' }))
  for (const name of ['chinese.pdf', 'scanned.pdf', 'protected.pdf']) copyFileSync(join(__dirname, '../test/fixtures/documents', name), join(root, name))
  writeFileSync(join(root, 'broken.pdf'), '%PDF-1.7\ninvalid')
}
