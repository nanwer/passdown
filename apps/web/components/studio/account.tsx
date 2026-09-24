'use client';
import { ChangePassword, SessionGate } from './frame';
export function YourAccount() {
  return <SessionGate>{() => <ChangePassword forced={false} />}</SessionGate>;
}
