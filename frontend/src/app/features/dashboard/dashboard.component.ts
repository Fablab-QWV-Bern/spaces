import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DefaultService } from '../../api/api/default.service';
import { Area } from '../../api/model/area';
import { Workplace } from '../../api/model/workplace';
import { Observable, forkJoin } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

interface AreaWithWorkplaces extends Area {
  workplaces: Workplace[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  private apiService = inject(DefaultService);

  // Define the ViewModel stream
  vm$: Observable<{ areas: AreaWithWorkplaces[] }> = forkJoin({
    areas: this.apiService.areasGet(),
    workplaces: this.apiService.workplacesGet(true)
  }).pipe(
    map(({ areas, workplaces }) => {
      // Create a map for faster lookup
      const workplacesByArea = new Map<string, Workplace[]>();
      workplaces.forEach(wp => {
        const list = workplacesByArea.get(wp.areaId) || [];
        list.push(wp);
        workplacesByArea.set(wp.areaId, list);
      });

      // Merge workplaces into areas
      const areasWithWorkplaces = areas.map(area => ({
        ...area,
        workplaces: workplacesByArea.get(area.id) || []
      }));

      return { areas: areasWithWorkplaces };
    }),
    shareReplay(1) // Prevent multiple API calls if multiple template subscriptions occur
  );
}
