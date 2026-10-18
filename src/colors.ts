export interface DeckColor {
  id: string;
  name: string;
  fill: string;
}

export const COLORS: DeckColor[] = [
  { id: 'red', name: 'Red', fill: '#e5484d' },
  { id: 'orange', name: 'Orange', fill: '#f2862b' },
  { id: 'green', name: 'Green', fill: '#2fa86b' },
  { id: 'blue', name: 'Blue', fill: '#4fb3df' },
  { id: 'purple', name: 'Purple', fill: '#a04fd0' },
  { id: 'pink', name: 'Pink', fill: '#ec4fa0' },
];
