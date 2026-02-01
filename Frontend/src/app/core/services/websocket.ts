import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Trade } from '../models/trade.interface';

@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  private socket!: WebSocket;
  
  // 1. Switch to BehaviorSubject so new subscribers get the last trade immediately
  // Initialize with null or a default trade object
  private tradeSubject = new BehaviorSubject<Trade | null>(null);

  constructor() { 
    this.connect();
  }

  private connect(): void {
    // Replace with your production URL if necessary
    this.socket = new WebSocket('ws://localhost:3000');

    this.socket.onopen = () => {
      console.log("✅ Connected to Backend WebSocket");
    };

    this.socket.onmessage = (event) => {
      try {
        const data: Trade = JSON.parse(event.data);
        
        // Validation check
        if (data && data.price) {
          this.tradeSubject.next(data);
        }
      } catch (err) {
        console.error("❌ Error parsing WebSocket message:", err);
      }
    };

    this.socket.onclose = () => {
      console.warn('⚠️ Connection lost. Retrying in 3 seconds...');
      setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = (error) => {
      console.error("🚀 WebSocket Error:", error);
    };
  }

  // 2. Return the observable as Trade | null to handle the initial state
  getTrade(): Observable<Trade | null> {
    return this.tradeSubject.asObservable();
  } 
  
  // 3. Helper to get the current state without an observable (useful for quick checks)
  getLatestTradeValue(): Trade | null {
    return this.tradeSubject.getValue();
  }
}