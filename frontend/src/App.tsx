import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Play, X, Search, Clapperboard, Folder } from 'lucide-react';
import './App.css';

interface Video {
  name: string;
  id: string;
  thumbnail: string;
}

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [folderPath, setFolderPath] = useState(() => {
    return localStorage.getItem('videoPlayerFolderPath') || '';
  });
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('videoPlayerVolume');
    return saved !== null ? parseFloat(saved) : 0.7;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('videoPlayerMuted') === 'true';
  });
  
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const initPlayer = async () => {
      if (folderPath) {
        try {
          await axios.post('/api/set-media-dir', { dirPath: folderPath });
        } catch (e) {
          console.error('Konnte initialen Pfad nicht setzen:', e);
        }
      }
      fetchVideos();
    };
    initPlayer();
  }, []);

  useEffect(() => {
    if (selectedVideo && videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [selectedVideo]);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/videos');
      if (Array.isArray(response.data)) {
        setVideos(response.data);
      } else {
        console.error('Ungültiges Datenformat vom Server:', response.data);
        setVideos([]);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Videos:', error);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFolder = async () => {
    try {
      await axios.post('/api/set-media-dir', { dirPath: folderPath });
      localStorage.setItem('videoPlayerFolderPath', folderPath);
      fetchVideos();
    } catch (error) {
      alert('Fehler beim Laden des Ordners. Bitte Pfad überprüfen.');
      console.error(error);
    }
  };

  const filteredVideos = useMemo(() => {
    return videos.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [videos, searchTerm]);

  const handleThumbnailError = (e: React.SyntheticEvent<HTMLImageElement, Event>, id: string) => {
    const target = e.target as HTMLImageElement;
    // Wenn das Poster (api/poster) fehlt, wechsle zum generierten Thumbnail
    if (target.src.includes('/api/poster/')) {
       target.src = `/thumbnails/${id}.png`;
       return;
    }
    // Wenn auch das Thumbnail fehlt, versuche es einmalig neu zu generieren
    if (target.getAttribute('data-retry')) return;
    target.setAttribute('data-retry', 'true');
    target.src = `/api/generate-thumbnail/${id}`;
  };

  return (
    <div className="app-container">
      <header>
        <div className="plex-logo">CELEB PLAYER</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Ordnerpfad..." 
              style={{ width: '300px' }}
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            />
            <button 
              onClick={handleLoadFolder}
              style={{ 
                background: '#e5a00d', 
                color: 'white', 
                border: 'none', 
                padding: '8px 15px', 
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Laden
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Suche..." 
              style={{ paddingLeft: '35px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="user-profile" style={{ background: '#333', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>P</div>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', marginTop: '100px', color: '#888' }}>
          <div className="spinner"></div>
          <p>Mediathek wird geladen...</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clapperboard size={20} color="#e5a00d" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Plex Library ({filteredVideos.length})</h2>
          </div>
          
          <div className="video-grid">
            {filteredVideos.map((video) => (
              <div key={video.id} className="video-card" onClick={() => setSelectedVideo(video)}>
                <div className="thumbnail-container">
                  <img 
                    src={video.thumbnail} 
                    alt={video.name} 
                    onError={(e) => handleThumbnailError(e, video.id)}
                  />
                  <div className="play-icon-overlay">
                    <div style={{ background: 'rgba(229, 160, 13, 0.9)', padding: '10px', borderRadius: '50%' }}>
                      <Play size={24} fill="white" color="white" />
                    </div>
                  </div>
                </div>
                <div className="video-info">
                  <p className="video-title" title={video.name}>{video.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                    <Folder size={12} color="#888" />
                    <p className="video-meta" style={{ margin: 0 }}>
                       {video.name.length > 25 ? video.name.substring(0, 25) + '...' : video.name}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedVideo && (
        <div className="modal-overlay" onClick={() => setSelectedVideo(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedVideo(null)}>
              <X size={24} /> Schließen
            </button>
            <video 
              ref={videoRef}
              controls 
              autoPlay
              onVolumeChange={(e) => {
                const videoEl = e.target as HTMLVideoElement;
                setVolume(videoEl.volume);
                setIsMuted(videoEl.muted);
                localStorage.setItem('videoPlayerVolume', videoEl.volume.toString());
                localStorage.setItem('videoPlayerMuted', videoEl.muted.toString());
              }}
            >
              <source src={`/api/stream/${selectedVideo.id}`} type="video/mp4" />
              Ihr Browser unterstützt den Video-Player nicht.
            </video>
            <h3 style={{ marginTop: '15px', color: 'white' }}>{selectedVideo.name}</h3>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
