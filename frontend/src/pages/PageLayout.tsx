import { ReactNode } from "react";
import PageNavbar from "../components/navbar/PageNavbar";

const PageLayout = ({ children }: {children: ReactNode}) => {
  return (
    <>
      <PageNavbar />
      {children}
    </>
  );
};

export default PageLayout;
