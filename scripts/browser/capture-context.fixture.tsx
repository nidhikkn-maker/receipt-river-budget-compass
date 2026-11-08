import { createRoot } from 'react-dom/client';
import { createRootRoute,createRouter,RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { SmartAdd } from '../../src/components/SmartAdd';
import { openSmartAdd } from '../../src/lib/smart-add-event';
import { CONTEXTS,type IntakeContext } from '../../src/lib/books/intake';
import { Button } from '../../src/components/ui/button';
import '../../src/styles.css';
function Fixture(){const [open,setOpen]=useState(false);return <main>{Object.keys(CONTEXTS).map(context=><Button key={context} onClick={()=>{openSmartAdd(context as IntakeContext);setOpen(true);}}>{context}</Button>)}<SmartAdd open={open} onOpenChange={setOpen}/></main>;}
const rootRoute=createRootRoute({component:Fixture});const router=createRouter({routeTree:rootRoute});const root=document.getElementById('root');if(root)createRoot(root).render(<RouterProvider router={router}/>);