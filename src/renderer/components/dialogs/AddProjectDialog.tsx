import { Folder } from 'lucide-react'
import { useDesk } from '../../store'
import { Button, Dialog } from '../ui/Dialog'

export function AddProjectDialog({ path }: { path: string }) {
  const { confirmAddProject, cancelAddProject, pickProject } = useDesk()
  return (
    <Dialog
      title="添加项目"
      onClose={cancelAddProject}
      footer={
        <>
          <Button onClick={() => void pickProject()}>重新选择…</Button>
          <div className="flex-1" />
          <Button onClick={cancelAddProject}>取消</Button>
          <Button variant="primary" onClick={() => void confirmAddProject()}>
            添加
          </Button>
        </>
      }
    >
      <p>将以下文件夹添加为项目：</p>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-chip px-3 py-2.5 font-mono text-[12.5px] text-fg select-text break-all">
        <Folder size={14} className="mt-0.5 shrink-0 text-fg2" />
        {path}
      </div>
      <p className="mt-3 text-[12.5px] text-fg3">在这个项目里新建的对话，Claude 会在此文件夹中读写文件和运行命令。</p>
    </Dialog>
  )
}
