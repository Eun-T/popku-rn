import { API_BASE_URL } from '../constants/api';

export const noticeCategories={GENERAL:'일반',UPDATE:'업데이트',EVENT:'이벤트',GUIDE:'이용 안내'} as const;
export type Notice={id:number;category:keyof typeof noticeCategories;title:string;content:string;publishedAt:string};
export type NoticePage={items:Notice[];nextCursor:string|null};
export class NoticeApiError extends Error { constructor(public readonly status:number){super(`Notice request failed (${status})`);} }
function valid(body:unknown):body is Notice {
  if(!body||typeof body!=='object')return false;const row=body as Partial<Notice>;
  return Number.isSafeInteger(row.id)&&row.id!>0&&typeof row.category==='string'&&Object.hasOwn(noticeCategories,row.category)
    &&typeof row.title==='string'&&typeof row.content==='string'&&typeof row.publishedAt==='string'&&Number.isFinite(Date.parse(row.publishedAt));
}
async function read(path:string,signal:AbortSignal):Promise<unknown>{
  // Public notices never attach credentials or change the current login session.
  const response=await fetch(`${API_BASE_URL}/api/notices${path}`,{signal});
  if(!response.ok)throw new NoticeApiError(response.status);const body:unknown=await response.json();
  if(signal.aborted)throw new Error('Notice read aborted');return body;
}
export async function getNotices(cursor:string|null,signal:AbortSignal):Promise<NoticePage>{
  const body=await read(cursor?`?cursor=${encodeURIComponent(cursor)}`:'',signal) as Partial<NoticePage>|null;
  if(!body||!Array.isArray(body.items)||!body.items.every(valid)||(body.nextCursor!==null&&(typeof body.nextCursor!=='string'||!body.nextCursor)))throw new Error('Invalid notice page');return body as NoticePage;
}
export async function getNotice(id:number,signal:AbortSignal):Promise<Notice>{
  if(!Number.isSafeInteger(id)||id<1)throw new NoticeApiError(404);const body=await read(`/${id}`,signal);
  if(!valid(body)||body.id!==id)throw new Error('Invalid notice detail');return body;
}
export function appendNotices(current:Notice[],incoming:Notice[]):Notice[]{
  const ids=new Set(current.map(row=>row.id));return [...current,...incoming.filter(row=>{if(ids.has(row.id))return false;ids.add(row.id);return true;})];
}
export function noticeDate(value:string):string{return value.slice(0,10).replace(/-/g,'.');}
