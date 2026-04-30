import { Component, ElementRef, EventEmitter, HostListener, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { SearchResult } from '../../models/types';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-bar.component.html',
})
export class SearchBarComponent implements OnDestroy {
  @Output() onSelect = new EventEmitter<{ id: string; name: string }>();
  @ViewChild('wrapper') wrapperRef!: ElementRef;

  query = '';
  results: SearchResult[] = [];
  open = false;
  loading = false;
  private timer: any;

  constructor(private api: ApiService) {}

  onFocus() {
    if (this.query.length < 2 && this.results.length === 0) {
      // Show top accounts on focus if no query typed yet
      this.loading = true;
      this.api.searchAccounts('GREYSTAR').then(r1 => {
        this.api.searchAccounts('RPM').then(r2 => {
          // Merge and deduplicate
          const map = new Map<string, SearchResult>();
          [...r1, ...r2].forEach(r => map.set(r.Id, r));
          this.results = Array.from(map.values()).slice(0, 10);
          this.open = this.results.length > 0;
          this.loading = false;
        });
      });
    } else if (this.results.length > 0) {
      this.open = true;
    }
  }

  onQueryChange() {
    if (this.query.length < 2) { this.results = []; this.open = false; return; }
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      this.loading = true;
      this.results = await this.api.searchAccounts(this.query);
      this.open = this.results.length > 0;
      this.loading = false;
    }, 300);
  }

  selectResult(r: SearchResult) {
    this.onSelect.emit({ id: r.Id, name: r.Name });
    this.query = r.Name;
    this.open = false;
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.wrapperRef && !this.wrapperRef.nativeElement.contains(event.target)) {
      this.open = false;
    }
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }
}
