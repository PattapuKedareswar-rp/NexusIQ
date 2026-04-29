import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { SystemicIssue } from '../../models/types';

@Component({
  selector: 'app-systemic-issues',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './systemic-issues.component.html',
})
export class SystemicIssuesComponent implements OnInit {
  issues: SystemicIssue[] = [];
  loading = false;
  expanded = true;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadIssues();
  }

  async loadIssues() {
    this.loading = true;
    const data = await this.api.getSystemicIssues();
    this.issues = data.product_issues;
    this.loading = false;
  }

  toggleExpanded() {
    this.expanded = !this.expanded;
  }
}
