import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home-page/home-page').then((m) => m.HomePage),
    title: $localize`:browser tab title@@title.home:Hjem · Smart hjem`,
  },
  {
    path: 'rum',
    loadComponent: () => import('./features/rooms/rooms-page/rooms-page').then((m) => m.RoomsPage),
    title: $localize`:browser tab title@@title.rooms:Rum · Smart hjem`,
  },
  {
    path: 'rum/:id',
    loadComponent: () =>
      import('./features/rooms/room-detail-page/room-detail-page').then((m) => m.RoomDetailPage),
    title: $localize`:browser tab title@@title.rooms:Rum · Smart hjem`,
  },
  {
    path: 'enheder',
    loadComponent: () =>
      import('./features/devices/devices-page/devices-page').then((m) => m.DevicesPage),
    title: $localize`:browser tab title@@title.devices:Enheder · Smart hjem`,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
