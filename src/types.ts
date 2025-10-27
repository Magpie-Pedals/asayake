// These types are shared between the frontend and tool code

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

export type AsaPlaylist = {
  name: string;
  albumImageUri: string;
  trackIds: string[]
};
export type AsaPlaylistList = AsaPlaylist[];
export type AsaPlaylistInternal = AsaTrackMeta[];
