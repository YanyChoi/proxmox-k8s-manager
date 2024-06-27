import { Navbar, NavbarBrand, NavbarContent } from "@nextui-org/react";
import { Link } from "react-router-dom";

const PageNavbar = () => {
    return (
        <Navbar shouldHideOnScroll isBordered>
            <NavbarBrand>
                <p className="font-bold text-inherit">Proxmox Manager</p>
            </NavbarBrand>
            <NavbarContent>
                <Link color="foreground" to={"/"}>Home</Link>
                <Link color="foreground" to={"/cluster"}>Cluster</Link>
                <Link color="foreground" to={"/monitor"}>Monitor</Link>
                <Link color="foreground" to={"/settings"}>Settings</Link>
            </NavbarContent>
        </Navbar>
    )
}

export default PageNavbar;