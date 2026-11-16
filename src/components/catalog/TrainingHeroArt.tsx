import type { ImgHTMLAttributes } from 'react';

/** Realistic patient rehabilitation photo for Upper Body */
export function UpperBodyTrainingArt(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/images/upper-body-patient.jpg"
      alt="Patient in rehabilitation clinic performing upper body therapy"
      loading="eager"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
      {...props}
    />
  );
}

/** Realistic patient rehabilitation photo for Lower Body */
export function LowerBodyTrainingArt(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/images/lower-body-patient.jpg"
      alt="Patient in rehabilitation clinic performing lower body balance therapy"
      loading="eager"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
      {...props}
    />
  );
}
