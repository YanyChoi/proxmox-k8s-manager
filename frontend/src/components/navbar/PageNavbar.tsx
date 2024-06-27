import { Navbar, NavbarBrand, NavbarContent } from "@nextui-org/react";
import { Link } from "react-router-dom";

const PageNavbar = () => {
    return (
        <Navbar shouldHideOnScroll isBordered>
            <NavbarBrand>
                <Link className="text-xl font-bold text-inherit" to={"/"}>Proxmox Manager</Link>
            </NavbarBrand>
            <NavbarContent>
                <Link className="text-inherit" to={"/"}>Home</Link>
                <Link className="text-inherit" to={"/cluster"}>Cluster</Link>
                <Link className="text-inherit" to={"/monitor"}>Monitor</Link>
                <Link className="text-inherit" to={"/settings"}>Settings</Link>
            </NavbarContent>
        </Navbar>
    )
}

export default PageNavbar;