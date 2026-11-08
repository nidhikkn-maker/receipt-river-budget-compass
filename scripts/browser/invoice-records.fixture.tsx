// Real route components with an explicitly isolated local store adapter.
import { createRoot } from 'react-dom/client';
import { createRootRoute,createRoute,createRouter,Outlet,RouterProvider } from '@tanstack/react-router';
import { Route as Assets } from '../../src/routes/_authenticated/assets';
import { Route as Vault } from '../../src/routes/_authenticated/vault';
import { Toaster } from '../../src/components/ui/sonner';
import '../../src/styles.css';
const root=createRootRoute({component:()=> <main><Outlet/><Toaster/></main>});
const auth=createRoute({getParentRoute:()=>root,id:'_authenticated',component:Outlet});
const assets=Assets.update({id:'/assets',path:'/assets',getParentRoute:()=>auth});
const vault=Vault.update({id:'/vault',path:'/vault',getParentRoute:()=>auth});
const router=createRouter({routeTree:root.addChildren([auth.addChildren([assets,vault])])});
const element=document.getElementById('root');
if(element)createRoot(element).render(<RouterProvider router={router}/>);