using System;
using System.Collections.Generic;
using System.IO;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace GlazerAdmin.Services;

/// <summary>
/// User settings persisted as YAML (user-facing, hand-editable). Replaces the
/// web app's localStorage config.
/// Location: &lt;ApplicationData&gt;/glazer-admin/settings.yaml
/// (e.g. ~/.config/glazer-admin on Linux, %APPDATA%\glazer-admin on Windows).
/// </summary>
public class AppSettings
{
    public string Language { get; set; } = Loc.DefaultLanguage;

    /// <summary>Annotation class name → hex color.</summary>
    public Dictionary<string, string> ClassNames { get; set; } = new()
    {
        ["tile"] = "#32CD32",
    };

    /// <summary>Key → tool name.</summary>
    public Dictionary<string, string> Keybinds { get; set; } = new()
    {
        ["r"] = "Rectangle",
        ["p"] = "Pan",
        ["w"] = "Selector",
    };
}

public static class SettingsService
{
    private static readonly ISerializer Serializer = new SerializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .Build();

    private static readonly IDeserializer Deserializer = new DeserializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .IgnoreUnmatchedProperties()
        .Build();

    public static AppSettings Current { get; private set; } = new();

    public static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "glazer-admin",
        "settings.yaml");

    public static void Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
                Current = Deserializer.Deserialize<AppSettings>(File.ReadAllText(SettingsPath)) ?? new AppSettings();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to load settings, using defaults: {ex.Message}");
            Current = new AppSettings();
        }
    }

    public static void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
            File.WriteAllText(SettingsPath, Serializer.Serialize(Current));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to save settings: {ex.Message}");
        }
    }
}
