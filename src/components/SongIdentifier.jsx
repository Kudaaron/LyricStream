import { useAudioRecognition } from '../hooks/useAudioRecognition';

export default function SongIdentifier({ onIdentified }) {
    const {
        status,
        error,
        secondsLeft,
        listen,
        stopEarly,
        reset
    } = useAudioRecognition();

    const handleClick = () => {
        // Stop an active recording
        if (status === 'listening') {
            stopEarly();
            return;
        }

        // Start a new recognition attempt
        if (status === 'idle' || status === 'error') {
            listen(onIdentified);
        }
    };

    const isBusy =
        status === 'verifying' ||
        status === 'processing';

    return (
        <div className="song-id-wrap">

            {/* ==================================================
                MAIN BUTTON
                ================================================== */}

            <button
                className={`
                    song-id-btn
                    ${status === 'listening' ? 'listening' : ''}
                    ${status === 'processing' ? 'processing' : ''}
                    ${status === 'verifying' ? 'verifying' : ''}
                `}
                onClick={handleClick}
                disabled={isBusy}
                title={
                    status === 'listening'
                        ? 'Stop listening'
                        : status === 'verifying'
                            ? 'Checking security'
                            : status === 'processing'
                                ? 'Identifying song'
                                : 'Identify a song playing nearby'
                }
            >

                {/* ------------------------------------------
                    LISTENING ANIMATION RINGS
                    ------------------------------------------ */}

                {status === 'listening' && (
                    <>
                        <span className="song-id-ring ring1" />
                        <span className="song-id-ring ring2" />
                        <span className="song-id-ring ring3" />
                    </>
                )}

                {/* ------------------------------------------
                    ICON
                    ------------------------------------------ */}

                <i
                    className={`
                        ti
                        ${status === 'processing'
                            ? 'ti-loader-2 spin'
                            : status === 'verifying'
                                ? 'ti-shield-check'
                                : 'ti-microphone'
                        }
                    `}
                />

            </button>


            {/* ==================================================
                STATUS MESSAGE
                ================================================== */}

            <p
                className={`
                    song-id-status
                    ${status === 'verifying' ? 'verifying' : ''}
                    ${status === 'listening' ? 'listening' : ''}
                    ${status === 'processing' ? 'processing' : ''}
                    ${status === 'error' ? 'error' : ''}
                `}
            >

                {/* IDLE */}

                {status === 'idle' &&
                    'Tap to identify a song playing nearby'
                }


                {/* VERIFYING */}

                {status === 'verifying' && (
                    <>
                        <i className="ti ti-shield-check" />
                        {' '}
                        Checking security…
                    </>
                )}


                {/* LISTENING */}

                {status === 'listening' && (
                    <>
                        <i className="ti ti-microphone" />
                        {' '}
                        Listening… {secondsLeft}s
                    </>
                )}


                {/* PROCESSING */}

                {status === 'processing' && (
                    <>
                        <i className="ti ti-search" />
                        {' '}
                        Identifying song…
                    </>
                )}


                {/* ERROR */}

                {status === 'error' && error}

            </p>


            {/* ==================================================
                EXTRA HELP TEXT
                ================================================== */}

            {status === 'verifying' && (
                <span className="song-id-hint">
                    Preparing song recognition
                </span>
            )}

            {status === 'listening' && (
                <span className="song-id-hint">
                    Keep the music playing nearby
                </span>
            )}

            {status === 'processing' && (
                <span className="song-id-hint">
                    Analyzing the recording
                </span>
            )}


            {/* ==================================================
                RETRY
                ================================================== */}

            {status === 'error' && (
                <button
                    type="button"
                    className="song-id-retry"
                    onClick={reset}
                >
                    <i className="ti ti-refresh" />
                    {' '}
                    Try again
                </button>
            )}

        </div>
    );
}