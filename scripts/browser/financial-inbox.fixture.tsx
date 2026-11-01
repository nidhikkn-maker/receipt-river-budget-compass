import React from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute,createRoute,createRouter,Outlet,RouterProvider } from '@tanstack/react-router';
import { Route as ActualInbox } from '../../src/routes/_authenticated/inbox';
import { Route as ActualTransfers } from '../../src/routes/_authenticated/transfers';
import { StoreFixture } from './financial-inbox-mocks';
import { Toaster } from '../../src/components/ui/sonner';
import '../../src/styles.css';
const root=createRootRoute({component:()=> <StoreFixture><main className="mx-auto max-w-6xl px-4 py-5"><Outlet/></main><Toaster/></StoreFixture>});
const component=ActualInbox.options.component;
const layout=createRoute({getParentRoute:()=>root,id:'_authenticated',component:Outlet});
const inbox=createRoute({getParentRoute:()=>layout,path:'/inbox',validateSearch:(s:Record<string,unknown>)=>({section:typeof s['section']==='string'?s['section']:undefined}),component:()=>component?<React.Fragment>{React.createElement(component)}</React.Fragment>:null});
// The file route's hook resolves this ID in the controlled router.

const transfers=createRoute({getParentRoute:()=>layout,path:'/transfers',component:ActualTransfers.options.component});
const router=createRouter({routeTree:root.addChildren([layout.addChildren([inbox,transfers])])});
const mount=document.getElementById('root');if(mount)createRoot(mount).render(<RouterProvider router={router}/>);