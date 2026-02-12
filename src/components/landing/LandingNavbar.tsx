import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navData = [
    { name: "Problem", href: "#problem" },
    { name: "Solution", href: "#solution" },
    { name: "Vision", href: "#vision" },
    { name: "About", href: "#about" },
];

export default function LandingNavbar() {
    const [isModalOpen, setModalOpen] = useState(false);

    return (
        <div className="fixed top-0 inset-x-0 z-50 flex justify-center pt-6 px-4">
            <div className="w-full max-w-4xl bg-theme-black/70 backdrop-blur-xl border border-theme-pink/10 rounded-full supports-[backdrop-filter]:bg-theme-black/40 shadow-[0_0_20px_rgba(255,182,193,0.05)] transition-all duration-300">
                <div className="px-6 sm:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex justify-start">
                            <Link to="/">
                                <h1 className="text-2xl font-bold whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-theme-pink to-theme-pink-glow">
                                    Stream<span>Pay</span>
                                </h1>
                            </Link>
                        </div>

                        <div className="-mr-2 -my-2 sm:hidden">
                            <button
                                onClick={() => setModalOpen(true)}
                                className="bg-theme-gray/50 rounded-full p-2 inline-flex items-center justify-center text-theme-pink hover:text-white hover:bg-theme-pink/20"
                            >
                                <Menu className="h-6 w-6" />
                            </button>
                        </div>

                        <nav className="hidden sm:flex space-x-6 items-center">
                            {navData.map((n) => (
                                <a
                                    key={n.name}
                                    href={n.href}
                                    className="px-4 py-2 rounded-full text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-300 font-medium border border-transparent hover:border-theme-pink/30 hover:shadow-[0_0_15px_rgba(255,182,193,0.3)]"
                                >
                                    {n.name}
                                </a>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isModalOpen && (
                    <div className="absolute top-0 inset-x-0 p-2 transition transform origin-top-right md:hidden z-50">
                        <div className="rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 bg-theme-black border border-theme-pink/20 divide-y-2 divide-gray-50">
                            <div className="pt-5 pb-6 px-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h1 className="text-2xl font-bold text-theme-pink">StreamPay</h1>
                                    </div>
                                    <div className="-mr-2">
                                        <button
                                            onClick={() => setModalOpen(false)}
                                            className="bg-theme-gray/50 rounded-md p-2 inline-flex items-center justify-center text-theme-pink hover:text-white hover:bg-theme-pink/20"
                                        >
                                            <X className="h-6 w-6" />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <nav className="grid gap-y-8">
                                        {navData.map((item) => (
                                            <a
                                                key={item.name}
                                                href={item.href}
                                                className="-m-3 p-3 flex items-center rounded-md hover:bg-theme-pink/10 border border-transparent hover:border-theme-pink/30 transition-all"
                                                onClick={() => setModalOpen(false)}
                                            >
                                                <span className="ml-3 text-base font-medium text-gray-300 hover:text-theme-pink">
                                                    {item.name}
                                                </span>
                                            </a>
                                        ))}
                                    </nav>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
