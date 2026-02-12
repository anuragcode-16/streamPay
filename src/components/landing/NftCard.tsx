
interface Props {
    image: string;
}

export const NftCard = ({ image }: Props) => {
    return (
        <div className="border border-theme-pink/20 bg-theme-black/50 backdrop-blur-sm min-h-[300px] sm:py-4 max-w-[250px] rounded-xl sm:rounded-md hover:border-theme-pink/50 transition-all duration-300">
            <div className="sm:-right-8 sm:-top-[50px] relative">
                <div className="rounded-t-xl sm:rounded-lg w-full h-[200px] bg-gradient-to-br from-theme-pink/20 to-theme-black overflow-hidden relative">
                    <img
                        src={image}
                        alt="title"
                        className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://placehold.co/400x400/121212/FFB6C1?text=NFT`;
                        }}
                    />
                </div>
            </div>
            <div className="px-5 py-3 sm:py-0 sm:-mt-4">
                <h1 className="text-[24px] font-bold font-mono text-white">Heart & Sol</h1>
                <div className="flex justify-between w-full mb-4 mt-2 px-1">
                    <div className="flex items-center text-sm text-gray-300">
                        <span className="text-theme-pink mr-1">♦</span>
                        <h1 className="pl-1">0.3234</h1>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const NftCardWithButton = ({ image }: Props) => {
    return (
        <div className="border border-theme-pink/20 bg-theme-black/50 backdrop-blur-sm min-h-[430px] sm:py-4 my-10 rounded-xl max-w-[350px] sm:rounded-md hover:border-theme-pink/50 transition-all duration-300 group">
            <div className="sm:px-3 sm:py-2 sm:-right-8 sm:-top-[50px] relative">
                <div className="rounded-t-xl sm:rounded-none w-full h-[250px] bg-gradient-to-br from-theme-pink/20 to-theme-black overflow-hidden">
                    <img
                        src={image}
                        alt="title"
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://placehold.co/400x400/121212/FFB6C1?text=Music+NFT`;
                        }}
                    />
                </div>
            </div>
            <div className="px-6 sm:-mt-4 py-4 sm:py-0">
                <h1 className="text-[30px] font-bold font-mono text-white">Heart & Sol</h1>
                <div className="flex justify-between w-full mb-4 mt-2 px-1">
                    <div className="flex items-center text-xl text-gray-300">
                        <span className="text-theme-pink mr-1">♦</span>
                        <h1 className="pl-2">0.3234</h1>
                    </div>
                    <h1 className="text-xl font-mono text-gray-400">16 Tokens</h1>
                </div>
                <div className="flex justify-between font-mono mt-4">
                    <button className="border border-theme-pink text-theme-pink rounded-2xl flex px-[.8em] py-[.5em] items-center hover:bg-theme-pink hover:text-black transition-colors">
                        <h1 className="font-bold">PLAY NOW</h1>
                    </button>

                    <button className="bg-theme-pink text-black rounded-2xl flex px-[1em] sm:px-[1.4em] py-[.5em] items-center font-bold hover:bg-theme-pink-glow transition-colors shadow-[0_0_15px_rgba(255,182,193,0.5)]">
                        BUY NFT
                    </button>
                </div>
            </div>
        </div>
    );
};
