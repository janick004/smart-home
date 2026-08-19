import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SmartHomeApi } from './core/api/smart-home-api';
import { SmartHomeApiStub } from './testing/api-stub';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: SmartHomeApi, useValue: new SmartHomeApiStub() }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the three sections and the add action', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const navText = element.querySelector('nav')?.textContent ?? '';
    expect(navText).toContain('Hjem');
    expect(navText).toContain('Rum');
    expect(navText).toContain('Enheder');
    expect(element.textContent).toContain('+ Tilføj');
  });
});
