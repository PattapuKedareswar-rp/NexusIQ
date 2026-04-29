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
