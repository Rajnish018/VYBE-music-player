import './PageHeader.css';

function PageHeader({
  eyebrow,
  title,
  description,
  right,
  className = '',
}) {
  return (
    <header
      className={`page-header ${className}`.trim()}
    >
      <div className="page-header-main">
        {eyebrow ? (
          <p className="page-header-eyebrow">
            {eyebrow}
          </p>
        ) : null}

        <div className="page-header-title-row">
          <h1 className="page-header-title">
            {title}
          </h1>

          {right ? (
            <div className="page-header-right">
              {right}
            </div>
          ) : null}
        </div>

        {description ? (
          <p className="page-header-description">
            {description}
          </p>
        ) : null}
      </div>
    </header>
  );
}

export default PageHeader;