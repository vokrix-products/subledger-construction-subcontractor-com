import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
        {footer ? <div className="row row-end" style={{ marginTop: 18 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
