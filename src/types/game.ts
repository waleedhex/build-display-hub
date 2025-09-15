export interface Question {
  id: string;
  question: string;
  answer: string;
  letter: string;
  difficulty?: number;
  category?: string;
}

export interface GameState {
  hexagons: { [key: string]: string };
  colors: { [key: string]: string };
  currentQuestion?: Question;
  buzzer?: BuzzerState;
  goldenLetter?: string;
  partyMode: boolean;
  isActive: boolean;
}

export interface BuzzerState {
  active: boolean;
  team: string;
  player: string;
}

export interface SessionData {
  session_id: string;
  data: GameState;
  last_activity: string;
}