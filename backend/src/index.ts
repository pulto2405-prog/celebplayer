import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Standard-Medienverzeichnis (Home-Videos oder aktuelles Verzeichnis)
const defaultDir = path.join(require('os').homedir(), 'Videos');
let currentMediaDir = (process.env.MEDIA_DIR && process.env.MEDIA_DIR !== 'undefined') 
    ? process.env.MEDIA_DIR 
    : (fs.existsSync(defaultDir) ? defaultDir : process.cwd());

// Hilfsfunktion für den rekursiven Dateiscan
async function getVideosRecursive(dir: string, baseDir: string): Promise<any[]> {
    let results: any[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const list = await fs.readdir(dir);

    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);

        if (stat && stat.isDirectory()) {
            if (file !== '.thumbnails' && !file.startsWith('.')) {
                const res = await getVideosRecursive(filePath, baseDir);
                results = results.concat(res);
            }
        } else if (['.mp4', '.mkv', '.avi', '.mov'].includes(path.extname(file).toLowerCase())) {
            const relativePath = path.relative(baseDir, filePath);
            const toSafeBase64 = (str: string) => {
                return Buffer.from(str, 'utf8').toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/, '');
            };
            const id = toSafeBase64(relativePath);
            
            // Suche nach einem Poster im gleichen Ordner
            const parentDir = path.dirname(filePath);
            const posterFiles = ['poster.jpg', 'poster.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'cover.png'];
            let posterPath = null;
            
            for (const p of posterFiles) {
                const pPath = path.join(parentDir, p);
                if (fs.existsSync(pPath)) {
                    posterPath = `/api/poster/${id}`;
                    break;
                }
            }

            results.push({
                name: file,
                id: id,
                thumbnail: posterPath || `/thumbnails/${id}.png`
            });
        }
    }
    return results;
}

app.use(cors());
app.use(express.json());

// Statische Auslieferung des Frontends (Produktion)
const frontendDist = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

// Hilfsfunktion für den Thumbnail-Pfad
const getThumbnailDir = () => path.join(currentMediaDir, '.thumbnails');

// Statische Auslieferung der Thumbnails aus dem aktuellen Verzeichnis
app.use('/thumbnails', (req, res, next) => {
    express.static(getThumbnailDir())(req, res, next);
});

// --- API ROUTEN ---

// Route für lokale Poster-Bilder (poster.jpg etc.)
app.get('/api/poster/:id', async (req: Request, res: Response) => {
    try {
        const relativePath = fromSafeBase64(req.params.id);
        const filePath = path.join(currentMediaDir, relativePath);
        const parentDir = path.dirname(filePath);
        
        const posterFiles = ['poster.jpg', 'poster.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'cover.png'];
        for (const p of posterFiles) {
            const pPath = path.join(parentDir, p);
            if (fs.existsSync(pPath)) {
                return res.sendFile(pPath);
            }
        }
        res.status(404).send('Kein Poster gefunden');
    } catch (e) {
        res.status(500).send('Fehler beim Laden des Posters');
    }
});

// Setze das Medienverzeichnis
app.post('/api/set-media-dir', async (req: Request, res: Response) => {
    const { dirPath } = req.body;
    console.log(`Anfrage /api/set-media-dir mit Pfad: ${dirPath}`);
    if (!dirPath) {
        return res.status(400).json({ error: 'Pfad ist erforderlich' });
    }
    if (!fs.existsSync(dirPath)) {
        console.error(`Pfad existiert nicht im Dateisystem: ${dirPath}`);
        return res.status(400).json({ error: 'Pfad existiert nicht' });
    }
    currentMediaDir = dirPath;
    
    try {
        await fs.ensureDir(getThumbnailDir());
        console.log(`Medienverzeichnis auf ${currentMediaDir} gesetzt. Thumbnails bereit.`);
    } catch (e) {
        console.error(`Fehler beim Erstellen des Thumbnail-Ordners: ${e}`);
    }
    
    res.json({ message: 'Medienverzeichnis aktualisiert', currentMediaDir });
});

// 1. Liste alle Videos (jetzt REKURSIV)
app.get('/api/videos', async (req: Request, res: Response) => {
    console.log(`Anfrage /api/videos für Verzeichnis: ${currentMediaDir}`);
    try {
        if (!fs.existsSync(currentMediaDir)) {
            console.error(`Verzeichnis existiert nicht: ${currentMediaDir}`);
            return res.status(404).json({ error: 'Medienverzeichnis nicht gefunden' });
        }
        
        const videos = await getVideosRecursive(currentMediaDir, currentMediaDir);
        console.log(`Gefundene Videos (rekursiv): ${videos.length}`);
        res.json(videos);
    } catch (error) {
        console.error('Fehler beim Lesen des Verzeichnisses:', error);
        res.status(500).json({ error: 'Verzeichnis konnte nicht gelesen werden' });
    }
});

// Hilfsfunktion für URL-sicheres Base64 Dekodieren
const fromSafeBase64 = (base64: string) => {
    let s = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Buffer.from(s, 'base64').toString('utf8');
};

// 2. Stream Endpunkt
app.get('/api/stream/:id', async (req: Request, res: Response) => {
    const filename = fromSafeBase64(req.params.id);
    const filePath = path.join(currentMediaDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Video nicht gefunden');
    }

    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// 3. Thumbnail Generierung
app.get('/api/generate-thumbnail/:id', async (req: Request, res: Response) => {
    const filename = fromSafeBase64(req.params.id);
    const filePath = path.join(currentMediaDir, filename);
    const thumbnailDir = getThumbnailDir();
    const thumbnailPath = path.join(thumbnailDir, `${req.params.id}.png`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Video nicht gefunden');
    }

    if (fs.existsSync(thumbnailPath)) {
        return res.sendFile(thumbnailPath);
    }

    try {
        await fs.ensureDir(thumbnailDir);
        const absolutePath = path.resolve(filePath);
        
        // Direkter spawn-Aufruf ist am sichersten für Sonderzeichen wie '%'
        // WICHTIG: '%' muss für FFmpeg verdoppelt werden (%%), damit es nicht als Platzhalter interpretiert wird
        const escapedPath = absolutePath.replace(/%/g, '%%');
        
        const { spawn } = require('child_process');
        const ffmpegProcess = spawn('ffmpeg', [
            '-ss', '10',
            '-i', escapedPath,
            '-frames:v', '1',
            '-s', '320x180',
            '-y',
            thumbnailPath
        ]);

        ffmpegProcess.on('close', (code: number) => {
            if (code === 0) {
                console.log(`Thumbnail erstellt für: ${filename}`);
                res.sendFile(thumbnailPath);
            } else {
                console.error(`FFmpeg Prozess beendet mit Code ${code} bei Datei: ${filename}`);
                res.status(500).send('Fehler bei der Thumbnail-Generierung');
            }
        });

        ffmpegProcess.on('error', (err: any) => {
            console.error(`Fehler beim Starten von FFmpeg:`, err);
            res.status(500).send('Interner Fehler');
        });
    } catch (error) {
        res.status(500).send('Interner Fehler');
    }
});

// --- CATCH-ALL ROUTE (Muss am Ende stehen!) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Backend läuft auf http://localhost:${PORT}`);
});
