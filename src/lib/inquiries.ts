import { API_BASE_URL } from '../constants/api';
import { clearTokens, getAuthSession } from './auth';

export const inquiryTypes = { GENERAL: '일반 문의', BUG: '오류 신고', INFO_CORRECTION: '정보 수정 요청', OTHER: '기타' } as const;
export type InquiryType = keyof typeof inquiryTypes;
export type InquiryStatus = 'PENDING' | 'RESOLVED';
export const inquiryStatus = { PENDING: '답변 대기', RESOLVED: '답변 완료' } as const;
export type InquiryItem = { id: number; type: InquiryType; title: string; status: InquiryStatus; createdAt: string; author: { id: number; nickname: string } };
export type InquiryDetail = InquiryItem & { content: string; answer: string | null; answeredAt: string | null; updatedAt: string };
export type InquiryPage = { items: InquiryItem[]; nextCursor: string | null };
export class InquiryApiError extends Error {
  constructor(public readonly status: number) { super(`Inquiry request failed (${status})`); }
}
export function inquiryTextBytes(value: string): number {
  let bytes=0;
  for (const char of value) { const code=char.codePointAt(0)!; bytes+=code<=0x7f ? 1 : code<=0x7ff ? 2 : code<=0xffff ? 3 : 4; }
  return bytes;
}
export function validInquiry(title: string, content: string): boolean {
  return !!title.trim() && title.trim().length<=150 && !!content.trim() && inquiryTextBytes(content.trim())<=65535;
}
async function request(path: string, signal?: AbortSignal, body?: unknown): Promise<unknown> {
  const session=await getAuthSession();
  if (!session.accessToken) throw new InquiryApiError(401);
  const response=await fetch(`${API_BASE_URL}/api/inquiries${path}`, {
    method: body===undefined ? 'GET' : 'POST', signal,
    headers: { Authorization: `Bearer ${session.accessToken}`, ...(body===undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body===undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status===401 && !signal?.aborted) await clearTokens(session.generation);
  if (!response.ok) throw new InquiryApiError(response.status);
  const result: unknown=await response.json();
  if (signal?.aborted) throw new Error('Inquiry request aborted');
  if ((await getAuthSession()).generation!==session.generation) throw new Error('Inquiry session changed');
  return result;
}
function item(body: unknown): body is InquiryItem {
  if (!body || typeof body!=='object') return false;
  const row=body as Partial<InquiryItem>;
  return Number.isSafeInteger(row.id) && row.id!>0 && typeof row.type==='string' && Object.hasOwn(inquiryTypes,row.type)
    && typeof row.title==='string' && (row.status==='PENDING' || row.status==='RESOLVED') && typeof row.createdAt==='string'
    && !!row.author && Number.isSafeInteger(row.author.id) && typeof row.author.nickname==='string';
}
export async function getMyInquiries(cursor: string | null, signal: AbortSignal): Promise<InquiryPage> {
  const body=await request(`/me${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,signal) as Partial<InquiryPage> | null;
  if (!body || !Array.isArray(body.items) || !body.items.every(item)
    || (body.nextCursor!==null && (typeof body.nextCursor!=='string' || !/^[1-9]\d*$/.test(body.nextCursor)))) throw new Error('Invalid inquiry page');
  return body as InquiryPage;
}
export async function getInquiry(id: number, signal: AbortSignal): Promise<InquiryDetail> {
  if (!Number.isSafeInteger(id) || id<1) throw new InquiryApiError(404);
  const body: unknown=await request(`/${id}`,signal);
  if (!item(body)) throw new Error('Invalid inquiry detail');
  const row=body as Partial<InquiryDetail>;
  if (row.id!==id || typeof row.content!=='string' || typeof row.updatedAt!=='string'
    || (row.status==='PENDING' && (row.answer!==null || row.answeredAt!==null))
    || (row.status==='RESOLVED' && (typeof row.answer!=='string' || !row.answer.trim() || typeof row.answeredAt!=='string')))
    throw new Error('Invalid inquiry detail');
  return row as InquiryDetail;
}
export async function createInquiry(type: InquiryType, title: string, content: string): Promise<{ id: number }> {
  if (!Object.hasOwn(inquiryTypes,type) || !validInquiry(title,content)) throw new Error('Invalid inquiry input');
  const result=await request('',undefined,{type,title:title.trim(),content:content.trim()}) as {id?: number} | null;
  if (!result || !Number.isSafeInteger(result.id) || result.id!<1) throw new Error('Invalid inquiry creation response');
  return {id:result.id!};
}
export function appendInquiries(current: InquiryItem[], incoming: InquiryItem[]): InquiryItem[] {
  const ids=new Set(current.map(row=>row.id));
  return [...current,...incoming.filter(row=>{ if(ids.has(row.id)) return false; ids.add(row.id); return true; })];
}
export function inquiryDate(value: string): string { return value.slice(0,10).replace(/-/g,'.'); }
