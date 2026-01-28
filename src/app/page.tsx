import Link from 'next/link';
import LoginGate from '@/components/LoginGate';
import { Calculator, Target, ArrowRight, ShoppingCart, Search } from 'lucide-react';

function HomePage() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-md space-y-4">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Margin Tools</h1>
          <p className="text-sm text-slate-500 mt-1">Choose a calculator</p>
        </div>

        {/* Profit Scout Card */}
        <Link href="/profit-scout" className="block">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5 hover:shadow-xl hover:border-blue-300 transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Calculator size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-slate-800">Profit Scout</h2>
                  <p className="text-sm text-slate-500">Product listing analysis</p>
                </div>
              </div>
              <ArrowRight className="text-slate-300 group-hover:text-blue-500 transition-colors" size={20} />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">Walmart</span>
              <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-medium">Amazon</span>
            </div>
          </div>
        </Link>

        {/* Repricing Calculator Card */}
        <Link href="/repricing" className="block">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5 hover:shadow-xl hover:border-emerald-300 transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Target size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-slate-800">Repricing Calculator</h2>
                  <p className="text-sm text-slate-500">Price adjustment tool</p>
                </div>
              </div>
              <ArrowRight className="text-slate-300 group-hover:text-emerald-500 transition-colors" size={20} />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-medium">Margin Check</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">Price Schedule</span>
            </div>
          </div>
        </Link>

        {/* Buying Opportunities Card */}
        <Link href="/buying-opportunities" className="block">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5 hover:shadow-xl hover:border-amber-300 transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <ShoppingCart size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-slate-800">Buying Opportunities</h2>
                  <p className="text-sm text-slate-500">Stock scarcity alerts</p>
                </div>
              </div>
              <ArrowRight className="text-slate-300 group-hover:text-amber-500 transition-colors" size={20} />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full font-medium">HIGH</span>
              <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-full font-medium">MEDIUM</span>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full font-medium">LOW</span>
            </div>
          </div>
        </Link>

        {/* Product Discovery Card */}
        <Link href="/product-discovery" className="block">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5 hover:shadow-xl hover:border-purple-300 transition-all group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Search size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-slate-800">Product Discovery</h2>
                  <p className="text-sm text-slate-500">Search & add new products</p>
                </div>
              </div>
              <ArrowRight className="text-slate-300 group-hover:text-purple-500 transition-colors" size={20} />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="text-xs bg-purple-50 text-purple-600 px-2 py-1 rounded-full font-medium">Walmart Search</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-medium">Auto-Upload</span>
            </div>
          </div>
        </Link>

      </div>
    </div>
  );
}

export default function Home() {
  return (
    <LoginGate>
      <HomePage />
    </LoginGate>
  );
}
