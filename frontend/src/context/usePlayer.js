import { useContext } from 'react';
import PlayerContext from './playerContext';

export function usePlayer() {
  const context = useContext(PlayerContext);

  if (!context) {
    throw new Error(
      'usePlayer must be used inside PlayerProvider',
    );
  }

  return context;
}

export default usePlayer;