import { useAudioRecognition } from '../hooks/useAudioRecognition';

export default function SongIdentifier({ onIdentified }) {
    const { status, error, secondsLeft, listen, stopEarly, reset } = useAudioRecognition();

    const handleClick = () => {
        if (status === 'listening') {
            stopEarly();
            return;
        }
        if (status === 'idle' || status === 'error') {
            listen(onIdentified);
        }
    };

    return (
        <div className="song-id-wrap">
            <button
                className={`song-id-btn ${status === 'listening' ? 'listening' : ''} ${status === 'processing' ? 'processing' : ''}`}
                onClick={handleClick}
                disabled={status === 'processing'}
                title={status === 'listening' ? 'Stop listening' : 'Identify a song playing nearby'}
            >
                {status === 'listening' && (
                    <>
                        <span className="song-id-ring ring1" />
                        <span className="song-id-ring ring2" />
                        <span className="song-id-ring ring3" />
                    </>
                )}
                <i className={`ti ${status === 'processing' ? 'ti-loader-2 spin' : 'ti-microphone'}`} />
            </button>

            <p className="song-id-status">
                {status === 'idle' && 'Tap to identify a song playing nearby'}
                {status === 'listening' && `Listening… ${secondsLeft}s`}
                {status === 'processing' && 'Identifying song…'}
                {status === 'error' && error}
            </p>

            {status === 'error' && (
                <button className="song-id-retry" onClick={reset}>
                    <i className="ti ti-refresh" /> Try again
                </button>
            )}
        </div>
    );
}