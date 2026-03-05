using UnityEngine;
using UnityEditor;

public class FixCandyTypes : MonoBehaviour
{
    [MenuItem("Tools/Fix Candy Types and Shaders")]
    public static void FixCandyTypesAndShaders()
    {
        string[] prefabPaths = {
            "Assets/Prefabs/Red.prefab",
            "Assets/Prefabs/Blue.prefab", 
            "Assets/Prefabs/Green.prefab",
            "Assets/Prefabs/Yellow.prefab",
            "Assets/Prefabs/Purple.prefab"
        };
        
        foreach (string path in prefabPaths)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null)
            {
                Candy candy = prefab.GetComponent<Candy>();
                if (candy != null)
                {
                    // CandyType'ı ata
                    if (path.Contains("Red"))
                        candy.candyType = Candy.CandyType.Red;
                    else if (path.Contains("Blue"))
                        candy.candyType = Candy.CandyType.Blue;
                    else if (path.Contains("Green"))
                        candy.candyType = Candy.CandyType.Green;
                    else if (path.Contains("Yellow"))
                        candy.candyType = Candy.CandyType.Yellow;
                    else if (path.Contains("Purple"))
                        candy.candyType = Candy.CandyType.Magenta;
                    else
                        candy.candyType = Candy.CandyType.Red;
                        
                    EditorUtility.SetDirty(candy);
                    Debug.Log($"Fixed candyType for {path}: {candy.candyType}");
                }
                
                PrefabUtility.SaveAsPrefabAsset(prefab, path);
            }
        }
        
        // CandyExplosion prefab'ını düzelt
        GameObject explosionPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/CandyExplosion.prefab");
        if (explosionPrefab != null)
        {
            ParticleSystem ps = explosionPrefab.GetComponent<ParticleSystem>();
            if (ps != null)
            {
                var renderer = ps.GetComponent<ParticleSystemRenderer>();
                if (renderer != null)
                {
                    // Unlit shader'ı zorla
                    Material unlitMaterial = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
                    if (unlitMaterial != null)
                    {
                        renderer.material = unlitMaterial;
                        Debug.Log("Fixed explosion prefab shader to Unlit");
                    }
                    else
                    {
                        Debug.LogWarning("Unlit shader not found!");
                    }
                }
            }
            
            PrefabUtility.SaveAsPrefabAsset(explosionPrefab, "Assets/CandyExplosion.prefab");
        }
        
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("All candy types and shaders fixed!");
    }
}
