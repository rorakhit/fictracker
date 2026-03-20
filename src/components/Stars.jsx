import { useState } from 'react';

export default function Stars({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="stars" onMouseLeave={() => setHover(0)}>
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`star ${i <= (hover || value || 0) ? 'filled' : ''}`}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange && onChange(i === value ? 0 : i)}>&#9733;</span>
      ))}
    </span>
  );
}
