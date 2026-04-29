import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  @Output() onLogin = new EventEmitter<void>();

  username = '';
  password = '';
  error = '';
  loading = false;

  constructor(private api: ApiService) {}

  async handleSubmit() {
    this.error = '';
    this.loading = true;
    const result = await this.api.login(this.username, this.password);
    this.loading = false;
    if (result) {
      this.onLogin.emit();
    } else {
      this.error = 'Invalid credentials. Admin access required.';
    }
  }
}
