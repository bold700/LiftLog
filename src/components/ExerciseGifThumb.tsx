/**
 * Klein GIF-plaatje bij een oefeningnaam, voor keuzelijsten. Zoekt de GIF client-side op
 * (geen API-call per rij) en verdwijnt stil als er geen GIF is of het laden mislukt.
 */
import { useState } from 'react';
import { Box } from '@mui/material';
import { gifUrlForExerciseName } from '../utils/exerciseGif';

interface ExerciseGifThumbProps {
  exerciseName: string;
  size?: number;
}

export function ExerciseGifThumb({ exerciseName, size = 36 }: ExerciseGifThumbProps) {
  const [failed, setFailed] = useState(false);
  const url = gifUrlForExerciseName(exerciseName);
  if (!url || failed) return null;
  return (
    <Box
      component="img"
      src={url}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        objectFit: 'cover',
        borderRadius: 1,
        display: 'block',
        bgcolor: '#fff',
      }}
    />
  );
}
