import { Component, Input, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const CUSTOMER_SUGGESTED = [
  'Why is this customer at risk?',
  'What should support do next?',
  'Summarize the open issues for this account.',
];

const ADMIN_SUGGESTED = [
  'What is the overall case backlog right now?',
  'Which accounts need immediate attention?',
  'Summarize the current PME escalation situation.',
];

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-panel.component.html',
})
export class ChatPanelComponent implements OnChanges {
  @Input() accountId?: string | null;
  @Input() accountName?: string;
  @ViewChild('scrollContainer') scrollRef!: ElementRef;

  isAdmin = true;
  suggested: string[] = ADMIN_SUGGESTED;
  input = '';
  messages: ChatMsg[] = [];
  loading = false;
  private prevAccountId?: string | null;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['accountId']) {
      this.isAdmin = !this.accountId;
      this.suggested = this.isAdmin ? ADMIN_SUGGESTED : CUSTOMER_SUGGESTED;
      if (this.prevAccountId !== this.accountId) {
        this.messages = [];
        this.prevAccountId = this.accountId;
      }
    }
  }

  async handleSend(q: string) {
    if (!q.trim() || this.loading) return;
    const userMsg: ChatMsg = { role: 'user', content: q.trim() };
    this.messages = [...this.messages, userMsg];
    this.input = '';
    this.loading = true;
    this.scrollToBottom();

    const history = this.messages.slice(0, -1).slice(-10);
    const answer = await this.api.askClaude(this.accountId ?? null, q.trim(), history);

    this.messages = [...this.messages, { role: 'assistant', content: answer }];
    this.loading = false;
    this.scrollToBottom();
  }

  clearMessages() {
    this.messages = [];
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.handleSend(this.input);
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollRef?.nativeElement) {
        this.scrollRef.nativeElement.scrollTop = this.scrollRef.nativeElement.scrollHeight;
      }
    });
  }
}
