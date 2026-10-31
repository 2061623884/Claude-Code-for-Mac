// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSuggestions } from '../src/renderer/components/newSession/useSuggestions'
import type { CommandCatalogSnapshot } from '../src/shared/commandCatalog'
const snapshot=(cwd:string,names:string[],revision=1,status:CommandCatalogSnapshot['status']='ready'):CommandCatalogSnapshot=>({cwd,revision,status,updatedAt:1,commands:names.map(name=>({name,description:name,argumentHint:''}))})
let listeners: Set<(s:CommandCatalogSnapshot)=>void>
function Harness({cwd='/a',query=''}:{cwd?:string;query?:string}) {
  const suggestions=useSuggestions({kind:'/',start:0,query},cwd)
  return <><span data-testid="status">{suggestions.status}</span><span data-testid="active">{suggestions.items[suggestions.active]?.key}</span>{suggestions.items.map((item,index)=><button key={item.key} onClick={()=>suggestions.setActive(index)}>{item.label}</button>)}<button onClick={suggestions.retry}>retry</button></>
}
beforeEach(()=>{
  listeners=new Set()
  window.desk={meta:{commands:vi.fn(()=>new Promise(()=>{})),onCommands:(listener:(s:CommandCatalogSnapshot)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)}}} as unknown as Window['desk']
})
afterEach(()=>{cleanup();Reflect.deleteProperty(window,'desk')})
it('renders init without waiting for SDK and filters each keystroke without new IPC requests',()=>{
  const view=render(<Harness />)
  expect(screen.getByRole('button',{name:'/init'})).toBeTruthy()
  const calls=vi.mocked(window.desk.meta.commands).mock.calls.length
  view.rerender(<Harness query="in" />);expect(screen.getByRole('button',{name:'/init'})).toBeTruthy()
  view.rerender(<Harness query="init" />)
  expect(window.desk.meta.commands).toHaveBeenCalledTimes(calls)
})
it('preserves the selected command when a background update reorders the list',()=>{
  render(<Harness />);fireEvent.click(screen.getByRole('button',{name:'/init'}))
  act(()=>listeners.forEach(listener=>listener(snapshot('/a',['aaa','init','clear'],3))))
  expect(screen.getByTestId('active').textContent).toBe('init')
})
it('also preserves the default selection during background refresh',()=>{
  render(<Harness />);const selected=screen.getByTestId('active').textContent!
  act(()=>listeners.forEach(listener=>listener(snapshot('/a',['aaa',selected],3))))
  expect(screen.getByTestId('active').textContent).toBe(selected)
})
it('ignores late results from a previously selected project and unsubscribes listeners',async()=>{
  let done!: (result:CommandCatalogSnapshot)=>void
  vi.mocked(window.desk.meta.commands).mockImplementation(cwd=>cwd==='/a'?new Promise(resolve=>{done=resolve}):Promise.resolve(snapshot('/b',['b-skill'],3)))
  const view=render(<Harness />);view.rerender(<Harness cwd="/b" />)
  await screen.findByRole('button',{name:'/b-skill'})
  await act(async()=>{done(snapshot('/a',['a-skill'],99));await Promise.resolve()})
  expect(screen.getByRole('button',{name:'/b-skill'})).toBeTruthy();expect(screen.queryByRole('button',{name:'/a-skill'})).toBeNull()
  expect(listeners.size).toBe(1);view.unmount();expect(listeners.size).toBe(0)
})
it('keeps fallback choices on IPC failure and retries explicitly',async()=>{
  vi.mocked(window.desk.meta.commands).mockRejectedValue(new Error('offline'))
  render(<Harness query="init" />)
  await waitFor(()=>expect(screen.getByTestId('status').textContent).toBe('error'))
  expect(screen.getByRole('button',{name:'/init'})).toBeTruthy()
  vi.mocked(window.desk.meta.commands).mockResolvedValue(snapshot('/a',['init'],5))
  fireEvent.click(screen.getByRole('button',{name:'retry'}))
  await waitFor(()=>expect(screen.getByTestId('status').textContent).toBe('ready'))
  expect(window.desk.meta.commands).toHaveBeenLastCalledWith('/a',true)
})

it('clears selection when the selected command disappears instead of silently selecting another',()=>{
  const view=render(<Harness />);fireEvent.click(screen.getByRole('button',{name:'/init'}))
  act(()=>listeners.forEach(listener=>listener(snapshot('/a',['different'],3))))
  expect(screen.getByTestId('active').textContent).toBe('')
  view.rerender(<Harness query="different" />)
  expect(screen.getByTestId('active').textContent).toBe('different')
})
