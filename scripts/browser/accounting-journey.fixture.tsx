import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRoute,createRouter,Outlet,RouterProvider} from '@tanstack/react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Route as Reports} from '../../src/routes/_authenticated/report-centre';
import {Route as Audit} from '../../src/routes/_authenticated/audit';
import {DocumentIntake} from '../../src/components/DocumentIntake';
import {Toaster} from '../../src/components/ui/sonner';
import '../../src/styles.css';
function Intake(){const [file,setFile]=useState<File|null>(null);return <main><input aria-label="Company financial original" type="file" onChange={e=>setFile(e.target.files?.[0]??null)}/>{file&&<DocumentIntake file={file} context="fy" onClose={()=>setFile(null)}/>}</main>;}
const query=new QueryClient();
const root=createRootRoute({component:()=> <QueryClientProvider client={query}><Outlet/><Toaster/></QueryClientProvider>});
const auth=createRoute({getParentRoute:()=>root,id:'_authenticated',component:Outlet});
const routes=[Reports.update({id:'/report-centre',path:'/report-centre',getParentRoute:()=>auth}),Audit.update({id:'/audit',path:'/audit',getParentRoute:()=>auth}),createRoute({getParentRoute:()=>auth,path:'/statements',component:Intake})];
const router=createRouter({routeTree:root.addChildren([auth.addChildren(routes)])});const mount=document.getElementById('root');if(mount)createRoot(mount).render(<RouterProvider router={router}/>);