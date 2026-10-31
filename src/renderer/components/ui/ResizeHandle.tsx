import { useLayout } from '../../layoutStore'

/** 侧栏边缘的拖动手柄：拖动调宽，双击恢复默认宽度。side 是侧栏所在的一边 */
export function ResizeHandle({
  side,
  width,
  defaultWidth,
  onResize
}: {
  side: 'left' | 'right'
  width: number
  defaultWidth: number
  onResize(width: number): void
}) {
  const setResizing = useLayout((s) => s.setResizing)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整宽度，双击恢复默认"
      title="拖动调整宽度，双击恢复默认"
      onDoubleClick={() => onResize(defaultWidth)}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        // 捕获指针：鼠标移出窗口再松开也能收到，不会留下「松手后还在跟着调宽」的状态
        const handle = e.currentTarget
        handle.setPointerCapture(e.pointerId)
        const startX = e.clientX
        setResizing(true)
        document.body.style.cursor = 'col-resize'
        const move = (ev: PointerEvent): void => {
          const dx = ev.clientX - startX
          onResize(side === 'left' ? width + dx : width - dx)
        }
        const end = (): void => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('lostpointercapture', end)
          document.body.style.cursor = ''
          setResizing(false)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('lostpointercapture', end)
      }}
      className={`group absolute top-0 bottom-0 z-30 w-2 cursor-col-resize ${side === 'left' ? '-right-1' : '-left-1'}`}
    >
      <div className="mx-auto h-full w-0.5 bg-transparent transition-colors duration-150 group-hover:bg-accent/50 group-active:bg-accent" />
    </div>
  )
}
