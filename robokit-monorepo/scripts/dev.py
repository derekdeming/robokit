#!/usr/bin/env python3
"""
RoboKit Development Tools
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

import typer
from dotenv import load_dotenv

app = typer.Typer(help="RoboKit development tools")

def get_project_root() -> Path:
    """Get the project root directory"""
    return Path(__file__).parent.parent

def run_command(cmd: str, description: str, cwd: Optional[Path] = None) -> bool:
    """Run a command and handle errors"""
    typer.echo(f"🔄 {description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True, cwd=cwd)
        typer.echo(f"✅ {description}")
        if result.stdout:
            typer.echo(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        typer.echo(f"❌ {description} failed: {e}")
        if e.stderr:
            typer.echo(e.stderr)
        return False

@app.command()
def init():
    """Generate configuration files from environment variables"""
    project_root = get_project_root()
    
    # Set up environment file
    env_example = project_root / ".env.example"
    env_file = project_root / ".env"
    
    if not env_example.exists():
        typer.echo("❌ .env.example not found")
        raise typer.Exit(1)
    
    if env_file.exists():
        typer.echo("✅ .env file already exists")
    else:
        try:
            shutil.copy(env_example, env_file)
            typer.echo("✅ Created .env from .env.example")
        except Exception as e:
            typer.echo(f"❌ Failed to create .env: {e}")
            raise typer.Exit(1)
    
    # Load environment variables
    if env_file.exists():
        load_dotenv(env_file)
        typer.echo(f"✅ Loaded environment from {env_file}")
    else:
        typer.echo(f"⚠️  {env_file} not found, using system environment variables")
    
    # Read environment variables (no defaults - will throw if not set)
    postgres_db = os.environ['DATABASE_NAME']
    postgres_user = os.environ['DATABASE_USER']
    
    # Create servers configuration
    servers_config = {
        "Servers": {
            "1": {
                "Name": "RoboKit Database",
                "Group": "Servers",
                "Host": "postgres",
                "Port": 5432,
                "MaintenanceDB": postgres_db,
                "Username": postgres_user,
                "SSLMode": "prefer",
                "SSLCert": "<STORAGE_DIR>/.postgresql/postgresql.crt",
                "SSLKey": "<STORAGE_DIR>/.postgresql/postgresql.key",
                "SSLCompression": 0,
                "Timeout": 10,
                "UseSSHTunnel": 0,
                "TunnelHost": "",
                "TunnelPort": "22",
                "TunnelUsername": "",
                "TunnelAuthentication": 0
            }
        }
    }
    
    # Write to file in data directory
    data_dir = project_root / "data"
    data_dir.mkdir(exist_ok=True)
    output_file = data_dir / "pgadmin-servers.json"
    try:
        with open(output_file, 'w') as f:
            json.dump(servers_config, f, indent=2)
    except Exception as e:
        typer.echo(f"❌ Failed to write {output_file}: {e}")
        raise typer.Exit(1)
    
    typer.echo(f"✅ Generated {output_file} from environment variables")
    typer.echo(f"   Database: {postgres_db}")
    typer.echo(f"   User: {postgres_user}")
    typer.echo(f"   Host: postgres:5432")

@app.command()
def db(
    action: str = typer.Argument(..., help="Action to perform: start or stop")
):
    """Manage the database with docker compose"""
    project_root = get_project_root()
    
    if action == "start":
        if not run_command("docker compose up -d", "Starting database", cwd=project_root):
            raise typer.Exit(1)
    elif action == "stop":
        if not run_command("docker compose down", "Stopping database", cwd=project_root):
            raise typer.Exit(1)
    else:
        typer.echo(f"❌ Unknown action: {action}. Use 'start' or 'stop'")
        raise typer.Exit(1)

@app.command()
def reset():
    """Stop containers and remove data directory"""
    project_root = get_project_root()
    
    # Stop containers
    if not run_command("docker compose down", "Stopping database", cwd=project_root):
        raise typer.Exit(1)
    
    # Remove data directory
    data_dir = project_root / "data"
    if data_dir.exists():
        try:
            shutil.rmtree(data_dir)
            typer.echo("✅ Removed data directory")
        except Exception as e:
            typer.echo(f"❌ Failed to remove data directory: {e}")
            raise typer.Exit(1)
    else:
        typer.echo("✅ Data directory already removed")

if __name__ == "__main__":
    app() 