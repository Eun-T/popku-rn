import { useCallback, useEffect, useState } from 'react';
import { getAuthSession, subscribeAuthSession } from '../lib/auth';

// Inquiry screens allow signed-out visits; resolve stored credentials before making any request.
export function useInquirySession() {
  const [session,setSession]=useState({ready:false,authenticated:false,generation:0,error:false});
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true,sequence=0;
    const read=async()=>{
      const current=++sequence;
      setSession(previous=>({...previous,ready:false,authenticated:false,error:false}));
      try {
        const auth=await getAuthSession();
        if(active && current===sequence) setSession({ready:true,authenticated:!!auth.accessToken,generation:auth.generation,error:false});
      } catch { if(active && current===sequence) setSession({ready:true,authenticated:false,generation:0,error:true}); }
    };
    const unsubscribe=subscribeAuthSession(()=>{void read();});
    void read();
    return()=>{active=false;unsubscribe();};
  },[retry]);
  return {...session,retry:useCallback(()=>setRetry(value=>value+1),[])};
}
