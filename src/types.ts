// These types are shared between the frontend and tool code

// HTML elements used in the Asa player
export type AsaElements = {
  playerTarget: HTMLElement;
  playlistListTarget: HTMLElement | null;
  searchTarget: HTMLInputElement | null;
  asa: HTMLElement | null;
  audioPlayer: HTMLAudioElement | null;
  playlist: HTMLElement | null;
  nowPlayingTitle: HTMLElement | null;
  nowPlayingArtist: HTMLElement | null;
  nowPlayingAlbum: HTMLElement | null;
  scrubberFill: HTMLElement | null;
  volumeFill: HTMLElement | null;
  albumImage: HTMLCanvasElement | null;
  tracks: HTMLElement[] | null;
};


export type AsaTrackMeta = {
  title: string; // The track title
  artist: string; // The list of artists
  albumTitle: string; // The album name
  albumDate: Date; // The date the album was released
  albumImageUri: string; // The URL to the album image
  audioUri: string; // The URL to the track
  duration?: number; // The duration of the track in seconds
  size?: number; // The size of the track in bytes
  bitRate?: number; // The bit rate of the track in kbps
}

export type AsaMasterList = {
  [key: string]: AsaTrackMeta;
};

export type AsaRecordRaw = {
  filename: string;
  format_name: string;
  format_long_name: string;
  size: string;
  bit_rate: string;
  duration: string;
  tags: {
    title: string;
    artist: string;
    album: string;
    comment: string;
    album_artist: string;
    date: string;
  };
}

export type AsaTrackId = string;
export type AsaPlaylistId = string;

export type AsaPlaylist = {
  title: string;
  albumImageUri: string;
  date: Date;
  artist: string;
  trackIds: AsaTrackId[]
};

export type AsaPlaylistSimple = AsaTrackId[];

// A union type for all playlist representations
export type AsaPlaylistUnion = AsaPlaylist | AsaPlaylistSimple | AsaPlaylistId;

export type AsaPlaylistList = {
  [key: string]: AsaPlaylist;
};

export type AsaPlaylistInternal = AsaTrackMeta[];
