import { useState } from 'react';
import type { Team } from '../data/teams';
import { cn } from '../lib/utils';

interface TeamLogoProps {
  team: Team;
  size?: number;
  className?: string;
}

/** Team logo with a colored-initials fallback if the CDN image fails. */
export function TeamLogo({ team, size = 32, className }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: team.primaryColor,
          fontSize: size * 0.34,
        }}
        aria-label={team.name}
      >
        {team.abbreviation}
      </div>
    );
  }

  return (
    <img
      src={team.logoUrl}
      alt={team.name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
