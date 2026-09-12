export default function Icon({ name, size = 20, ...props }) {
  const paths = {
    book: (
      <>
        <path d="M3 4h6c2 0 3 1 3 2v15c0-2-1-3-3-3H3z" />
        <path d="M21 4h-6c-2 0-3 1-3 2v15c0-2 1-3 3-3h6z" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m10 8 6 4-6 4z" />
      </>
    ),
    pdf: (
      <>
        <path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6" />
      </>
    ),
    html: (
      <>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    close: <path d="m5 5 14 14M5 19 19 5" />,
    edit: (
      <>
        <path d="m14 4 6 6M4 20l5-1L21 7l-5-5L4 14z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    logout: (
      <>
        <path d="M10 3H4v18h6m4-15 6 6-6 6M9 12h11" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    list: <path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.book}
    </svg>
  );
}
