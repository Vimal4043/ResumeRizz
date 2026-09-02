import { Link } from "react-router-dom";
import PageContainer from "../components/layout/PageContainer.jsx";
import Button from "../components/common/Button.jsx";

export default function NotFound() {
  return (
    <PageContainer title="Page not found">
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-6xl" aria-hidden="true">
          404
        </p>
        <p className="text-text-muted">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link to="/">
          <Button>Back to home</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
