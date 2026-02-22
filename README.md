# Stream Pay

Stream Pay is a modern, real-time money streaming application designed for merchants and customers to manage continuous payments effortlessly. Built with **React**, **Vite**, **Tailwind CSS**, and **Supabase**, it leverages the **Superfluid Protocol** for real-time finance.

## 🚀 Features

- **Real-time Money Streaming**: Create, update, and delete money streams in real-time.
- **Role-Based Dashboards**:
  - **Merchant Dashboard**: Manage incoming streams, view analytics, and handle withdrawals.
  - **Customer Dashboard**: Create outgoing streams, manage subscriptions, and top-up balances.
- **Secure Authentication**: Robust authentication system powered by Supabase.
- **Modern UI/UX**: A clean, responsive interface built with Shadcn UI and Framer Motion.
- **Interactive Elements**: Real-time notifications and dynamic data visualization.

## 🛠️ Technology Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [Shadcn UI](https://ui.shadcn.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Backend & Auth**: [Supabase](https://supabase.com/)
- **Web3 Protocol**: [Superfluid](https://www.superfluid.finance/)
- **State Management**: [TanStack Query](https://tanstack.com/query/latest)

## 🏁 Getting Started

Follow these steps to get the project up and running on your local machine.

### Prerequisites

- **Node.js**: Version 18 or higher recommended.
- **npm** or **bun**: Package manager of your choice.

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd stream-pay
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:8080`.

## 📜 Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the app for production.
- `npm run lint`: Lints the codebase using ESLint.
- `npm run preview`: Previews the production build locally.

## 📂 Project Structure

```
src/
├── components/        # Reusable UI components
│   ├── ui/           # Shadcn UI primitives
│   └── landing/      # Landing page sections
├── contexts/         # React Contexts (Auth, Theme, etc.)
├── hooks/            # Custom React hooks
├── integrations/     # Supabase and other integrations
├── pages/            # Main application routes/pages
├── lib/              # Utility functions and libraries
└── main.tsx          # Application entry point
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
