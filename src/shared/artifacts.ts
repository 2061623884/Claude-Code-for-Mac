export interface ArtifactSource {
  sessionId: string
  cwd: string
  evidence: 'file-tool' | 'delivery-link' | 'manual'
}
export interface LocalArtifact {
  id: string
  path: string
  name: string
  type: string
  sources: ArtifactSource[]
  missing?: boolean
}
export interface ArtifactSnapshot {
  revision: number
  items: LocalArtifact[]
}
export const ARTIFACT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'tsv',
  'ppt',
  'pptx',
  'md',
  'markdown',
  'txt',
  'html',
  'htm',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg'
])
