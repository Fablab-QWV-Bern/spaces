export interface TimelineEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  subtitle?: string;
  color?: string;
  data?: any; // To store the original object (e.g., Booking)
}
