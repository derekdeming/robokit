## Environment Configuration

- Set up environment variables using the project `.env.example` as a template. Copy it to `.env` (or `.env.local` inside `frontend/`) and fill in required values. Missing variables will throw at startup.
# RoboKit Frontend

A production-grade web application for robotics engineers to upload, inspect, and convert gigabyte-scale robot sensor datasets. Built with modern web technologies for performance, scalability, and developer experience.

## Features

### **Authentication & User Management**
- Secure authentication with Clerk
- Organization-based access control
- Seamless sign-in/sign-up flow with animated welcome page
- JWT token-based API security

### **Dataset Management** 
- Upload multi-gigabyte robot sensor datasets
- Resumable file uploads with TUS protocol
- Support for `.rosbag`, `.hdf5`, `.parquet`, and other formats
- Real-time upload progress tracking
- Chunk-based uploads for reliability

### **Advanced Visualization**
- **3D Visualization**: Robot trajectories and sensor data with Three.js
- **Statistical Plots**: Time series and analytics with Plotly.js  
- **Interactive Charts**: Real-time performance metrics
- **Responsive Design**: Works across desktop and mobile devices

### **Performance & Reliability**
- Server-side rendering with Next.js 15
- Optimized caching with React Query
- Type-safe APIs with tRPC
- Efficient state management with Zustand

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 15 (App Router) + TypeScript |
| **Authentication** | Clerk SDK |
| **Styling** | Tailwind CSS + shadcn/ui |
| **State Management** | React Query + Zustand |
| **API Layer** | REST (FastAPI) |
| **File Uploads** | Uppy + TUS resumable uploads |
| **3D Graphics** | Three.js |
| **Charts** | Plotly.js |
| **Development** | ESLint + TypeScript strict mode |

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Clerk account for authentication

### Installation

1. **Clone and install dependencies**:
   ```bash
   git clone <repository-url>
   cd robokit-monorepo/frontend
   npm install
   ```

2. **Set up environment variables**:
   - Copy `.env.example` to `.env` (or `frontend/.env.local`) and fill in required values.
   - See `.env.example` for the complete list and descriptions.

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to `http://localhost:3000` (or your chosen `PORT`)

## Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── welcome/                  # Welcome page with auth flow  
│   ├── dashboard/                # Main application dashboard
│   ├── api/                      # Next.js API routes (proxy)
│   │   └── datasets/            # Dataset-specific APIs
│   ├── layout.tsx               # Root layout and providers
│   ├── page.tsx                 # Root redirect page
│   └── globals.css              # Global styles
├── components/                   # Reusable React components
│   ├── layout/                  # Navigation and layout
│   ├── datasets/                # Dataset management UI
│   ├── upload/                  # File upload components  
│   ├── visualization/           # Data visualization
│   └── ui/                      # shadcn/ui components
├── lib/                         # Utilities and configurations
│   ├── stores/                 # Zustand state stores
│   ├── stores/                 # Zustand state stores
│   ├── theme-provider.tsx      # Dark/light theme support
│   └── utils.ts                # Utility functions
├── types/                       # TypeScript definitions
│   └── dataset/                # Dataset-related types
├── hooks/                       # Custom React hooks
│   └── api/                    # API-specific hooks
└── public/                      # Static assets
    └── favicon.ico
```

## Key Features Deep Dive

### Authentication Flow
- **Welcome Page**: Beautiful animated spiral gradient background with sign-in/sign-up
- **Protected Routes**: Automatic redirect for unauthenticated users
- **Organization Support**: Multi-tenant architecture ready

### File Upload System
- **Chunked Uploads**: Handle large files reliably
- **Resume Support**: TUS protocol for interrupted uploads  
- **Progress Tracking**: Real-time upload status
- **Error Handling**: Graceful failure recovery

### Visualization Engine
- **Three.js Integration**: 3D robot trajectories and point clouds
- **Plotly.js Charts**: Interactive time-series and statistical plots
- **Responsive Design**: Adapts to all screen sizes
- **Performance Optimized**: Efficient rendering for large datasets

## Development

### Available Commands

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production  
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks

# UI Components  
npx shadcn@latest add [component]  # Add shadcn/ui components
```

### Code Style Guidelines
- TypeScript strict mode enabled
- ESLint configuration for consistent formatting
- Component-first architecture
- Clean, efficient, and modular code
- Comments only when needed for clarity

### Environment Configuration

- See `.env.example` for all variables, descriptions, and which are required.

## Architecture

### Data Flow
```
User Authentication (Clerk)
    ↓
Protected Routes & Pages
    ↓
React Query (Server State)
    ↓
Next.js API Proxy (/api/backend) → FastAPI (REST)
```

### State Management Strategy
- **Server State**: React Query for caching, synchronization
- **Client State**: Zustand for UI state, user preferences  
- **Form State**: React Hook Form for complex forms
- **URL State**: Next.js router for navigation state

### Component Architecture
- **Atomic Design**: Atoms, molecules, organisms pattern
- **Composition**: Higher-order components for shared logic
- **Type Safety**: Full TypeScript coverage
- **Testing**: Jest + Testing Library setup ready

## Roadmap

### Current stuff 
- Enhanced welcome page with animated background (Complete)
- Improved authentication flow (Complete)
- Code cleanup and optimization (Complete)
- Dataset upload workflow (In Progress --> this is currently broken and doesn't actually work)

