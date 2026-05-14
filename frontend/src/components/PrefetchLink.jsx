import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { prefetchPathFromTo } from '../utils/routePrefetch';

const PrefetchLink = forwardRef(function PrefetchLink(
  { to, onMouseEnter, onFocus, onTouchStart, onPointerDown, ...rest },
  ref
) {
  const warm = () => prefetchPathFromTo(to);

  return (
    <Link
      ref={ref}
      to={to}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      onPointerDown={(e) => {
        warm();
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
});

export default PrefetchLink;
