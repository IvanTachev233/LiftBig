import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { authInterceptor } from './core/auth.interceptor';
import { ThemeService } from './core/theme.service';
import { startUp } from './core/startup';
import { AppUpdateService } from './core/app-update.service';
import { AppUpdateScreenComponent } from './shared/components/app-update-screen/app-update-screen.component';
import { TermsUpdateScreenComponent } from './shared/components/terms-update-screen/terms-update-screen.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    AppUpdateScreenComponent,
    TermsUpdateScreenComponent,
  ],
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideAppInitializer(startUp),
    provideAppInitializer(() => inject(ThemeService).init()),
    // Not awaited: the version check never holds up routing
    provideAppInitializer(() => void inject(AppUpdateService).start()),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
