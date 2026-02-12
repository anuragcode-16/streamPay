export default function LandingFooter() {
    return (
        <div className="bg-theme-black border-t border-theme-pink/10 pt-4 sm:pt-10 lg:pt-12 text-white">
            <h1 className="text-[40px] sm:text-[60px] px-10 font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
                Liquify Your <br /> <span className="text-theme-pink">Payments.</span>
            </h1>

            <footer className="max-w-screen-2xl px-4 md:px-8 mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center border-t border-theme-pink/20 gap-4 py-6">
                    <nav className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-2 md:gap-6">
                        <a
                            href="#"
                            className="text-gray-400 hover:text-theme-pink transition duration-100"
                        >
                        </a>
                        <a
                            href="#"
                            className="text-gray-400 hover:text-theme-pink transition duration-100"
                        >
                            Twittter
                        </a>
                        <a
                            href="#"
                            className="text-gray-400 hover:text-theme-pink transition duration-100"
                        >
                            Medium
                        </a>
                        <a
                            href="#"
                            className="text-gray-400 hover:text-theme-pink transition duration-100"
                        >
                            Contact
                        </a>
                    </nav>
                    <div className="text-gray-400">Back to the top</div>
                </div>

                <div className="text-gray-500 text-sm text-start flex py-8 justify-between">
                    <div className="flex">
                        <h1 className="hover:text-theme-pink cursor-pointer transition-colors">Privacy Policy</h1>{" "}
                        <h1 className="ml-4 hover:text-theme-pink cursor-pointer transition-colors"> Terms and Conditions</h1>
                    </div>
                    <div>Copyright © 2026 StreamPay</div>
                </div>
            </footer>
        </div>
    );
}
